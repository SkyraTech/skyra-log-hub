import { Injectable, type PipeTransform } from '@nestjs/common';
import { InvalidArgumentException } from '../../../../common/errors/query.errors.js';
import type { EventLookupQueryDto } from '../dto/event-lookup-query.dto.js';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_ID_REGEX = /^[a-z0-9_-]{1,64}$/;
const DATE_PARTITION_REGEX = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

@Injectable()
export class EventLookupValidationPipe implements PipeTransform<unknown, EventLookupQueryDto> {
  public transform(value: unknown): EventLookupQueryDto {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new InvalidArgumentException('Query parameters must be an object.');
    }

    const query = value as Record<string, unknown>;

    if (!query['projectId'] || typeof query['projectId'] !== 'string') {
      throw new InvalidArgumentException('Required query parameter "projectId" is missing or not a string.');
    }

    if (!PROJECT_ID_REGEX.test(query['projectId'])) {
      throw new InvalidArgumentException(`Invalid projectId "${query['projectId']}". Must match pattern [a-z0-9_-]{1,64}.`);
    }

    if (query['date'] !== undefined) {
      if (typeof query['date'] !== 'string' || !DATE_PARTITION_REGEX.test(query['date'])) {
        throw new InvalidArgumentException(`Invalid date partition hint "${String(query['date'])}". Expected YYYY-MM-DD.`);
      }
    }

    return {
      projectId: query['projectId'],
      date: query['date'] as string | undefined,
    };
  }

  public static validateEventId(eventId: string): string {
    if (!eventId || typeof eventId !== 'string' || !UUID_V4_REGEX.test(eventId)) {
      throw new InvalidArgumentException(`Path parameter "eventId" must be a valid RFC 4122 UUIDv4: "${eventId}".`);
    }
    return eventId;
  }
}

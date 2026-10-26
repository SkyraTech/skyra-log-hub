import type { TimeRangeDto } from './aggregate-request.dto.js';
import type { AllowedFacetField } from '../../domain/facet.model.js';

export interface FacetsRequestDto {
  time_range: TimeRangeDto;
  projects?: string[];
  environments?: string[];
  facet_fields: AllowedFacetField[];
}

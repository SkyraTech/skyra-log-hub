import type {CanDeactivateFn} from '@angular/router';
import type {MembersComponent} from './members.component';
export const memberChangesGuard:CanDeactivateFn<MembersComponent>=component=>component.canLeave();

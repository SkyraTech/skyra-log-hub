/**
 * @skyra/logger-angular - Angular HttpInterceptorFn
 * Opt-in HTTP request duration and status tracking without body consumption.
 */
import type { HttpRequest, HttpHandlerFn, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
export declare function skyraHttpInterceptor(req: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>>;
//# sourceMappingURL=skyra-http-interceptor.d.ts.map
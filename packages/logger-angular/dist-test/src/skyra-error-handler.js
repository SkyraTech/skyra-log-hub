/**
 * @skyra/logger-angular - Angular ErrorHandler Integration
 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Injectable, ErrorHandler, Inject, Optional } from '@angular/core';
import { SkyraLoggerService } from './skyra-logger.service.js';
let SkyraErrorHandler = class SkyraErrorHandler {
    constructor(_logger, _originalHandler) {
        this._logger = _logger;
        this._originalHandler = _originalHandler;
    }
    handleError(error) {
        const errObj = error instanceof Error ? error : new Error(String(error));
        // Capture and sanitize uncaught Angular error
        this._logger.error(`Angular uncaught error: ${errObj.message}`, {
            error: errObj,
            action: 'angular.error.uncaught',
        });
        // Forward to original handler or console to preserve devtools experience
        if (this._originalHandler && typeof this._originalHandler.handleError === 'function') {
            try {
                this._originalHandler.handleError(error);
            }
            catch {
                // Prevent recursive failure
            }
        }
        else if (typeof console !== 'undefined' && typeof console.error === 'function') {
            console.error(error);
        }
    }
};
SkyraErrorHandler = __decorate([
    Injectable(),
    __param(0, Inject(SkyraLoggerService)),
    __param(1, Optional()),
    __param(1, Inject('ORIGINAL_ERROR_HANDLER')),
    __metadata("design:paramtypes", [SkyraLoggerService,
        ErrorHandler])
], SkyraErrorHandler);
export { SkyraErrorHandler };
//# sourceMappingURL=skyra-error-handler.js.map
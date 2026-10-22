/**
 * @skyra/logger-angular - Angular Injectable Logger Service
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
import { Injectable, Inject, Optional } from '@angular/core';
import { createSkyraBrowserLogger, } from '@skyra/logger-browser';
import { SKYRA_LOGGER_CONFIG } from './tokens.js';
let SkyraLoggerService = class SkyraLoggerService {
    constructor(config) {
        if (!config) {
            // Safe fallback config if provider not explicitly registered
            this._logger = createSkyraBrowserLogger({
                projectId: 'skyra-angular',
                serviceName: 'angular-app',
                environment: 'development',
                transport: { type: 'console' },
            });
        }
        else {
            this._logger = createSkyraBrowserLogger(config);
        }
    }
    get underlyingLogger() {
        return this._logger;
    }
    isLevelEnabled(level) {
        return this._logger.isLevelEnabled(level);
    }
    setLevel(level) {
        this._logger.setLevel(level);
    }
    getLevel() {
        return this._logger.getLevel();
    }
    log(level, message, metadata) {
        return this._logger.log(level, message, metadata);
    }
    trace(message, metadata) {
        return this._logger.trace(message, metadata);
    }
    debug(message, metadata) {
        return this._logger.debug(message, metadata);
    }
    info(message, metadata) {
        return this._logger.info(message, metadata);
    }
    warn(message, metadata) {
        return this._logger.warn(message, metadata);
    }
    error(message, metadata) {
        return this._logger.error(message, metadata);
    }
    fatal(message, metadata) {
        return this._logger.fatal(message, metadata);
    }
    child(context) {
        return this._logger.child(context);
    }
    startTimer(name, options) {
        return this._logger.startTimer(name, options);
    }
    trackNavigation(payload) {
        this._logger.trackNavigation(payload);
    }
    async flush() {
        await this._logger.flush();
    }
    async dispose() {
        await this._logger.dispose();
    }
    getStatus() {
        return this._logger.getStatus();
    }
    ngOnDestroy() {
        void this.dispose();
    }
};
SkyraLoggerService = __decorate([
    Injectable({
        providedIn: 'root',
    }),
    __param(0, Optional()),
    __param(0, Inject(SKYRA_LOGGER_CONFIG)),
    __metadata("design:paramtypes", [Object])
], SkyraLoggerService);
export { SkyraLoggerService };
//# sourceMappingURL=skyra-logger.service.js.map
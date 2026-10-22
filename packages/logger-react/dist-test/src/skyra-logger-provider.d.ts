/**
 * @skyra/logger-react - SkyraLoggerProvider Component
 */
import React, { type ReactNode } from 'react';
import { SkyraBrowserLogger, type SkyraBrowserLoggerConfig } from '@skyra/logger-browser';
export interface SkyraLoggerProviderProps {
    readonly children?: ReactNode;
    readonly logger?: SkyraBrowserLogger;
    readonly config?: SkyraBrowserLoggerConfig;
}
export declare function SkyraLoggerProvider({ children, logger, config, }: SkyraLoggerProviderProps): React.JSX.Element;
//# sourceMappingURL=skyra-logger-provider.d.ts.map
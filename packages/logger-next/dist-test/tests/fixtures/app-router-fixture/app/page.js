import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { getSkyraServerLogger } from "@skyra/logger-next";
export default async function Page() {
    const logger = getSkyraServerLogger();
    if (logger) {
        logger.info("Server Component rendered Home page", {
            component: "HomePage"
        });
    }
    return (_jsxs("main", { children: [_jsx("h1", { children: "Skyra Tech App Router Fixture" }), _jsx("p", { children: "Server-side rendered page" })] }));
}
//# sourceMappingURL=page.js.map
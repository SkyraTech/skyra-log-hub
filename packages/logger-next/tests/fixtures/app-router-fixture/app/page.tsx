import React from "react";
import { getSkyraServerLogger } from "@skyra/logger-next";

export default async function Page() {
  const logger = getSkyraServerLogger();
  if (logger) {
    logger.info("Server Component rendered Home page", {
      component: "HomePage"
    });
  }

  return (
    <main>
      <h1>Skyra Tech App Router Fixture</h1>
      <p>Server-side rendered page</p>
    </main>
  );
}

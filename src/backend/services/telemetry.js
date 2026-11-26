// Application Insights via Azure Monitor OpenTelemetry. Enabled only when
// APPLICATIONINSIGHTS_CONNECTION_STRING is set (App Service setting), so tests and
// local development send nothing. Must run before the app and its libraries load.
function startTelemetry() {
  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

  if (!connectionString || process.env.NODE_ENV === "test") {
    return false;
  }

  try {
    const { useAzureMonitor } = require("@azure/monitor-opentelemetry");
    useAzureMonitor({ azureMonitorExporterOptions: { connectionString } });
    return true;
  } catch (error) {
    console.error(`Telemetry disabled: ${error.message}`);
    return false;
  }
}

module.exports = { startTelemetry };

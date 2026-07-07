export interface ObservationFinding {
  type: 'success' | 'data' | 'file' | 'warning';
  summary: string;
}

export interface StructuredObservation {
  toolCallId: string;
  server: string;
  tool: string;
  arguments: Record<string, any>;
  images?: Array<{ data: string; mimeType: string }>;
  successMetrics: {
    transportSuccess: boolean;
    toolSuccess: boolean;
    businessSuccess: boolean;
  };
  output: string;
  filesCreated: string[];
  filesModified: string[];
  error?: string;
  executionDurationMs: number;
  importantFindings: ObservationFinding[];
  summary: string;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function inferFindings(args: Record<string, any>, tool: string, output: string, successMetrics: StructuredObservation['successMetrics'], filesCreated: string[], filesModified: string[], error?: string): ObservationFinding[] {
  const findings: ObservationFinding[] = [];

  if (error) {
    findings.push({ type: 'warning', summary: `The tool reported an error: ${normalizeText(error)}` });
    return findings;
  }

  if (successMetrics.businessSuccess) {
    findings.push({ type: 'success', summary: `Completed ${tool} successfully.` });
  }

  if (filesCreated.length > 0) {
    findings.push({ type: 'file', summary: `Created ${filesCreated.join(', ')}` });
  }

  if (filesModified.length > 0) {
    findings.push({ type: 'file', summary: `Modified ${filesModified.join(', ')}` });
  }

  const pathValue = typeof args.path === 'string' ? args.path : undefined;
  const normalizedOutput = normalizeText(output);

  if (normalizedOutput && normalizedOutput.length <= 240) {
    findings.push({ type: 'data', summary: normalizedOutput });
  } else if (pathValue) {
    findings.push({ type: 'data', summary: `Read or inspected ${pathValue}` });
  }

  return findings.slice(0, 4);
}

export function buildStructuredObservation(params: {
  toolCallId: string;
  server: string;
  tool: string;
  arguments: Record<string, any>;
  output: string;
  successMetrics: StructuredObservation['successMetrics'];
  error?: string;
  executionDurationMs: number;
  filesCreated?: string[];
  filesModified?: string[];
  images?: Array<{ data: string; mimeType: string }>;
}): StructuredObservation {
  const filesCreated = params.filesCreated ?? [];
  const filesModified = params.filesModified ?? [];
  const importantFindings = inferFindings(
    params.arguments,
    params.tool,
    params.output,
    params.successMetrics,
    filesCreated,
    filesModified,
    params.error,
  );

  const summary = [
    `${params.server}/${params.tool}`,
    params.successMetrics.businessSuccess ? 'completed successfully' : 'did not complete successfully',
    filesCreated.length ? `created ${filesCreated.length} file(s)` : '',
    filesModified.length ? `modified ${filesModified.length} file(s)` : '',
  ].filter(Boolean).join(', ');

  return {
    toolCallId: params.toolCallId,
    server: params.server,
    tool: `${params.server}/${params.tool}`,
    arguments: params.arguments,
    successMetrics: params.successMetrics,
    output: params.output,
    filesCreated,
    filesModified,
    error: params.error,
    executionDurationMs: params.executionDurationMs,
    images: params.images,
    importantFindings,
    summary,
  };
}

export type WorkspaceKind = "organizer" | "response" | "comparison";

export function workspaceForImportedResponses(responseCount: number): WorkspaceKind {
  return responseCount > 1 ? "comparison" : "response";
}

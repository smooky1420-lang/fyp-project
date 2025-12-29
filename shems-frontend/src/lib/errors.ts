export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;

  // Handles cases where a thrown value is an object like { message: "..." }
  if (typeof err === "object" && err !== null && "message" in err) {
    const maybeMsg = (err as { message?: unknown }).message;
    if (typeof maybeMsg === "string") return maybeMsg;
  }

  return "Something went wrong";
}

// A business or permission error. `code` is stable: the frontend maps it to Spanish text.
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

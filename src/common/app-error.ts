/**
 * 统一应用错误类
 * 所有业务错误必须使用此类，禁止裸 throw string
 */
export class AppError extends Error {
  /** HTTP 状态码 */
  public readonly statusCode: number;

  /** 机器可读错误码 */
  public readonly code: string;

  /** 是否属于预期内的业务错误（非系统故障） */
  public readonly isOperational: boolean;

  /**
   * @param statusCode - HTTP 状态码
   * @param code - 机器可读错误码，如 'PATH_TRAVERSAL'
   * @param message - 人类可读错误描述
   * @param isOperational - 是否为预期业务错误
   */
  constructor(
    statusCode: number,
    code: string,
    message: string,
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /** 400 参数校验错误 */
  static badRequest(code: string, message: string): AppError {
    return new AppError(400, code, message);
  }

  /** 401 未认证 */
  static unauthorized(message = '未提供有效的认证凭据'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  /** 403 权限不足 */
  static forbidden(message: string): AppError {
    return new AppError(403, 'FORBIDDEN', message);
  }

  /** 404 资源不存在 */
  static notFound(resource: string): AppError {
    return new AppError(404, 'NOT_FOUND', `${resource} 不存在`);
  }

  /** 409 资源冲突 */
  static conflict(message: string): AppError {
    return new AppError(409, 'CONFLICT', message);
  }

  /** 500 内部错误 */
  static internal(message: string): AppError {
    return new AppError(500, 'INTERNAL_ERROR', message, false);
  }

  /** 502 外部命令执行失败 */
  static commandFailed(command: string, detail: string): AppError {
    return new AppError(
      502,
      'COMMAND_FAILED',
      `命令执行失败 [${command}]: ${detail}`,
    );
  }
}

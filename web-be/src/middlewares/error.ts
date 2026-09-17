import { Request, Response, NextFunction } from 'express';

type HttpError = Error & {
  expose?: boolean;
  status?: number;
  statusCode?: number;
  type?: string;
};

const getErrorStatus = (err: HttpError) => {
  const status = err.statusCode || err.status;
  return status && status >= 400 && status < 600 ? status : 500;
};

export const errorHandler = (
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const status = getErrorStatus(err);

  if (status >= 500) console.error('Error:', err);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }
  
  return res.status(status).json({
    error: status < 500 && err.expose ? err.message : 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};

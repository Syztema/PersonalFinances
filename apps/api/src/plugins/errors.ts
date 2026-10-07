import type { FastifyError, FastifyInstance } from 'fastify';
import { AppError } from '../lib/errors';

const CLIENT_MESSAGES: Record<number, string> = {
  400: 'Solicitud inválida.',
  401: 'Inicia sesión para continuar.',
  403: 'No tienes permiso para esta acción.',
  404: 'No encontrado.',
  413: 'La solicitud es demasiado grande.',
  415: 'Formato no soportado: envía JSON.',
  429: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
};

function prismaCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string' && /^P\d{4}$/.test(code)) return code;
  }
  return undefined;
}

export function setupErrorHandling(app: FastifyInstance) {
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' } });
  });

  app.setErrorHandler((err: FastifyError | AppError | Error, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        error: { code: err.code, message: err.message, ...(err.fields && { fields: err.fields }) },
      });
    }

    const pCode = prismaCode(err);
    if (pCode === 'P2002' || pCode === 'P2003' || pCode === 'P2004' || pCode === 'P2025') {
      req.log.warn({ code: pCode }, 'Error de base de datos mapeado');
    }
    if (pCode === 'P2002') {
      return reply
        .status(409)
        .send({ error: { code: 'DUPLICATE', message: 'Ya existe un registro con esos datos.' } });
    }
    if (pCode === 'P2003' || pCode === 'P2004') {
      return reply
        .status(400)
        .send({ error: { code: 'INVALID_REFERENCE', message: 'Los datos no son válidos.' } });
    }
    if (pCode === 'P2025') {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'No encontrado.' } });
    }

    const status = (err as FastifyError).statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      return reply.status(status).send({
        error: {
          code: (err as FastifyError).code ?? 'BAD_REQUEST',
          message: CLIENT_MESSAGES[status] ?? 'Solicitud inválida.',
        },
      });
    }

    // Los mensajes de Prisma incluyen argumentos de la consulta (montos, correos, tokens): no se registran.
    const safeErr =
      pCode || err.name.startsWith('PrismaClient')
        ? { name: err.name, code: pCode }
        : { name: err.name, message: err.message, stack: err.stack };
    req.log.error({ err: safeErr }, 'Error no controlado');
    return reply
      .status(500)
      .send({ error: { code: 'INTERNAL', message: 'Ocurrió un error inesperado.' } });
  });
}

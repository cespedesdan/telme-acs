import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";

export function badRequest(code: string, message: string): BadRequestException {
  return new BadRequestException(errorBody(code, message));
}

export function unauthorized(): UnauthorizedException {
  return new UnauthorizedException(
    errorBody("UNAUTHORIZED", "Credenciais ou sessão inválidas."),
  );
}

export function forbidden(): ForbiddenException {
  return new ForbiddenException(
    errorBody("FORBIDDEN_OPERATION", "Operação não permitida."),
  );
}

export function notFound(): NotFoundException {
  return new NotFoundException(
    errorBody("DEVICE_NOT_FOUND", "Dispositivo não encontrado."),
  );
}

export function capabilityUnknown(): ConflictException {
  return new ConflictException(
    errorBody(
      "CAPABILITY_UNKNOWN",
      "Esta função ainda não foi validada para o equipamento.",
    ),
  );
}

export function upstreamUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException(
    errorBody("GENIEACS_UNAVAILABLE", "GenieACS indisponível."),
  );
}

export function operationConflict(): ConflictException {
  return new ConflictException(
    errorBody(
      "OPERATION_CONFLICT",
      "Esta solicitação já foi usada para outra operação.",
    ),
  );
}

export function databaseUnavailable(): ServiceUnavailableException {
  return new ServiceUnavailableException(
    errorBody("DATABASE_UNAVAILABLE", "Banco de dados indisponível."),
  );
}

function errorBody(code: string, message: string): object {
  return { code, message, correlationId: randomUUID() };
}

# NestJS

- [Overview](#overview)
- [Installation](#installation)
- [Project Structure](#project-structure)
- [Bootstrap](#bootstrap)
- [Module, Service & Controller](#module-service--controller)
- [Exception Filter](#exception-filter)
- [Validation Pipe](#validation-pipe)

---

## Overview

NestJS uses a Dependency Injection container that initialises providers lazily. To guarantee Orion is bootstrapped before any provider accesses a model, import `database.ts` at the top of `AppModule` — outside the class body.

---

## Installation

```bash
npm install @nestjs/core @nestjs/common @nestjs/platform-express reflect-metadata rxjs
npm install -D @nestjs/cli ts-node typescript
```

---

## Project Structure

```
src/
  database.ts               ← Orion bootstrap
  main.ts                   ← NestJS entry point
  app.module.ts
  users/
    users.module.ts
    users.controller.ts
    users.service.ts
    dto/
      create-user.dto.ts
      update-user.dto.ts
  database/
    models/
      User.ts
    migrations/
```

---

## Bootstrap

```ts
// src/database.ts
import { createConnection } from '@wrsouza/orion';

export default createConnection({
  connection: process.env.DATABASE_URL ?? {
    driver:   'postgres',
    host:     process.env.DB_HOST ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'myapp',
    user:     process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASS ?? '',
    ssl:      process.env.DB_SSL === 'true',
  },
  migrations: { path: './src/database/migrations' },
  preventLazyLoading: process.env.NODE_ENV !== 'production',
});
```

Import at the very top of `AppModule` — the side-effect import runs before any provider initialises:

```ts
// src/app.module.ts
import '../database';          // ← bootstraps Orion before any provider runs
import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';

@Module({ imports: [UsersModule] })
export class AppModule {}
```

```ts
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

---

## Module, Service & Controller

::: code-group

```ts [users.module.ts]
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers:   [UsersService],
})
export class UsersModule {}
```

```ts [users.service.ts]
import { Injectable, NotFoundException } from '@nestjs/common';
import { ModelNotFoundException } from '@wrsouza/orion';
import { User } from '../../database/models/User';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  async findAll(page = 1, perPage = 15) {
    return User.paginate(perPage, page);
  }

  async findOne(id: string) {
    try {
      return await User.findOrFail(id);
    } catch (e) {
      if (e instanceof ModelNotFoundException) throw new NotFoundException();
      throw e;
    }
  }

  create(dto: CreateUserDto) {
    return User.create(dto);
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findOne(id);
    await user.update(dto);
    return user;
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    await user.delete();
  }
}
```

```ts [users.controller.ts]
import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Query, HttpCode,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query('page') page = 1, @Query('perPage') perPage = 15) {
    return this.usersService.findAll(Number(page), Number(perPage));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
```

```ts [dto/create-user.dto.ts]
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
```

```ts [dto/update-user.dto.ts]
import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {}
```

:::

---

## Exception Filter

Use a single global filter to map all Orion exceptions to HTTP responses. See [Error Handling](/error-handling) for full details on each exception.

```ts
// src/filters/orion-exception.filter.ts
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import {
  ModelNotFoundException,
  MassAssignmentException,
  QueryException,
} from '@wrsouza/orion';
import { Response } from 'express';

@Catch(ModelNotFoundException, MassAssignmentException, QueryException)
export class OrionExceptionFilter implements ExceptionFilter {
  catch(
    exception: ModelNotFoundException | MassAssignmentException | QueryException,
    host: ArgumentsHost,
  ) {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ModelNotFoundException) {
      return res.status(HttpStatus.NOT_FOUND).json({ error: 'Not found' });
    }

    if (exception instanceof MassAssignmentException) {
      return res
        .status(HttpStatus.UNPROCESSABLE_ENTITY)
        .json({ error: exception.message });
    }

    if (exception instanceof QueryException) {
      const isUnique = (exception.cause as any).code === '23505';
      if (isUnique) {
        return res.status(HttpStatus.CONFLICT).json({ error: 'Already exists' });
      }
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'Database error' });
    }
  }
}
```

Register globally in `main.ts`:

```ts
app.useGlobalFilters(new OrionExceptionFilter());
```

---

## Validation Pipe

`ValidationPipe` with `whitelist: true` strips any property not declared in the DTO before it reaches the service — a clean way to prevent mass-assignment without extra code.

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist:        true,   // strip unknown properties
  forbidNonWhitelisted: true, // throw 400 on unknown properties
  transform:        true,   // cast query params to declared types
}));
```

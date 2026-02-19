import { Module } from '@nestjs/common';

import { controllers } from './controllers';
import { services } from './services';
import { configuration } from './config';
import { ConfigModule } from '@nestjs/config';

import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';

@Module({
    imports: [
        ConfigModule.forRoot({
            load: [configuration],
        }),
    ],
    controllers: [
        ...controllers,
    ],
    providers: [
        {
            provide: APP_PIPE,
            useClass: ZodValidationPipe,
        },
        {
            provide: APP_INTERCEPTOR,
            useClass: ZodSerializerInterceptor,
        },
        ...services,
    ],
})
export class AppModule { }

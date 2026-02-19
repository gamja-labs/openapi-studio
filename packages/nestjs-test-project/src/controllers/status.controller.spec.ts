import { Test, TestingModule } from '@nestjs/testing';
import { StatusController } from './status.controller';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config';
import { pkg } from '../utils/environment';
describe('StatusController', () => {
    let app: TestingModule;
    let statusController: StatusController;

    beforeEach(async () => {
        app = await Test.createTestingModule({
            controllers: [StatusController],
            providers: [ConfigService<AppConfig>],
        }).compile();

        statusController = app.get<StatusController>(StatusController);
    });

    describe('root', () => {
        it('should return the status', async () => {
            const configService = app.get(ConfigService<AppConfig>);
            jest.spyOn(configService, 'getOrThrow').mockReturnValue('test');
            
            expect(statusController.status()).resolves.toEqual({
                version: pkg.version,
                build_id: 'test',
            });
        });
    });
});

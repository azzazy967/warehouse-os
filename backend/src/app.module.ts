import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Public } from './common/decorators';
import { JwtAuthGuard, RolesGuard } from './common/guards';
import { getDatabaseOptions } from './config/database.config';
import { AuthModule } from './modules/auth.module';
import { DashboardModule } from './modules/dashboard.module';
import { InventoryModule } from './modules/inventory.module';
import { LocationsModule } from './modules/locations.module';
import { MovementsModule } from './modules/movements.module';
import { PickingModule } from './modules/picking.module';
import { ProductsModule } from './modules/products.module';
import { ReceivingModule } from './modules/receiving.module';
import { ShippingModule } from './modules/shipping.module';
import { UsersModule } from './modules/users.module';

@Controller()
export class AppController {
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'warehouse-api' };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(getDatabaseOptions()),
    AuthModule,
    UsersModule,
    ProductsModule,
    LocationsModule,
    InventoryModule,
    MovementsModule,
    ReceivingModule,
    PickingModule,
    ShippingModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

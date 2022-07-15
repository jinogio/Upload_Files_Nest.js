import {
  Controller,
  Post,
  Param,
  Req,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('/:filename')
  @HttpCode(204)
  async upload(
    @Req() req: Request,
    @Headers('content-type') contentType: string,
    @Param('filename') filename: string,
  ): Promise<any> {
    try {
      await this.appService.upload(req, contentType, filename);
    } catch (err) {
      throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
    }
  }
}

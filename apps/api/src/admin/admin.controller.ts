import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
  Header,
} from '@nestjs/common';
import { z } from 'zod';
import {
  adminCharacterInput,
  adminPhotoInput,
  adminLevelsInput,
  adminUploadInput,
} from '@companion/shared';
import { AdminGuard, type AdminRequest } from './admin.guard';
import { AdminService } from './admin.service';
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new BadRequestException(
      r.error.issues.map((x) => x.message).join('；'),
    );
  return r.data;
}
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly service: AdminService) {}
  @Get('me') @Header('Cache-Control', 'no-store') me(@Req() req: AdminRequest) {
    return req.admin;
  }
  @Get('characters') @Header('Cache-Control', 'no-store') characters(
    @Query('before') before?: string,
  ) {
    return this.service.characters(
      before ? parse(z.uuid(), before) : undefined,
    );
  }
  @Post('characters') charactersSave(
    @Req() req: AdminRequest,
    @Body() body: unknown,
  ) {
    return this.service.saveCharacter(
      req.admin,
      parse(adminCharacterInput, body),
    );
  }
  @Get('photos') @Header('Cache-Control', 'no-store') photos(
    @Query('characterId') id: string,
  ) {
    return this.service.photos(parse(z.uuid(), id));
  }
  @Post('photos') photoSave(@Req() req: AdminRequest, @Body() body: unknown) {
    return this.service.savePhoto(req.admin, parse(adminPhotoInput, body));
  }
  @Get('levels') @Header('Cache-Control', 'no-store') levels(
    @Query('characterId') id: string,
  ) {
    return this.service.levels(parse(z.uuid(), id));
  }
  @Post('levels') levelsSave(@Req() req: AdminRequest, @Body() body: unknown) {
    return this.service.saveLevels(req.admin, parse(adminLevelsInput, body));
  }
  @Get('audit') @Header('Cache-Control', 'no-store') audit(
    @Query('before') before?: string,
  ) {
    return this.service.audit(
      before ? parse(z.string().regex(/^[0-9]{1,18}$/), before) : undefined,
    );
  }
  @Post('uploads') upload(@Req() req: AdminRequest, @Body() body: unknown) {
    return this.service.upload(
      req.admin,
      parse(adminUploadInput, body).contentType,
    );
  }
  @Post('preview') preview(@Body() body: unknown) {
    return this.service.preview(
      parse(
        z
          .object({
            path: z
              .string()
              .min(1)
              .max(512)
              .refine(
                (x) =>
                  !x.includes('..') &&
                  !x.startsWith('/') &&
                  ![...x].some((c) => c.charCodeAt(0) < 32),
              ),
          })
          .strict(),
        body,
      ).path,
    );
  }
}

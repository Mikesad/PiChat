import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  type CreateModelConfigRequest,
  isModelKind,
  isModelProvider,
  type ModelConfigListResponse,
  type ModelConfigResponse,
  type ModelKind,
  type ModelProviderId,
  type SessionUser,
  type UpdateModelConfigRequest,
} from "@pichat/shared";
import { z } from "zod";
import { parseBody } from "../../common/validation";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { ModelConfigsService } from "./model-configs.service";

const baseUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => /^https?:\/\//i.test(value), "Base URL 必须以 http:// 或 https:// 开头");

const providerSchema = z.custom<ModelProviderId>((value) => isModelProvider(value), {
  message: "不支持的服务商",
});

const kindSchema = z.custom<ModelKind>((value) => isModelKind(value), {
  message: "不支持的模型类型",
});

const createSchema = z.object({
  kind: kindSchema,
  provider: providerSchema,
  modelId: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(120),
  baseUrl: baseUrlSchema,
  apiKey: z.string().trim().min(1).max(4096),
  makeDefault: z.boolean().optional(),
});

const updateSchema = z.object({
  kind: kindSchema,
  provider: providerSchema,
  modelId: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(120),
  baseUrl: baseUrlSchema,
  apiKey: z.string().max(4096).optional(),
  makeDefault: z.boolean().optional(),
});

@Controller("model-configs")
@UseGuards(SessionGuard)
export class ModelConfigsController {
  constructor(
    @Inject(ModelConfigsService) private readonly modelConfigsService: ModelConfigsService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: SessionUser,
    @Query("kind") kind?: string,
  ): Promise<ModelConfigListResponse> {
    const modelKind = kind && isModelKind(kind) ? kind : undefined;
    return { modelConfigs: await this.modelConfigsService.list(user, modelKind) };
  }

  @Post()
  async create(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ): Promise<ModelConfigResponse> {
    const input = parseBody<CreateModelConfigRequest>(createSchema, body);
    return { modelConfig: await this.modelConfigsService.create(user, input) };
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ): Promise<ModelConfigResponse> {
    const input = parseBody<UpdateModelConfigRequest>(updateSchema, body);
    const apiKey = input.apiKey?.trim();
    return {
      modelConfig: await this.modelConfigsService.update(user, id, {
        ...input,
        apiKey: apiKey && apiKey.length > 0 ? apiKey : undefined,
      }),
    };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string, @CurrentUser() user: SessionUser): Promise<void> {
    await this.modelConfigsService.remove(user, id);
  }

  @Post(":id/default")
  @HttpCode(HttpStatus.OK)
  async setDefault(
    @Param("id") id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<ModelConfigResponse> {
    return { modelConfig: await this.modelConfigsService.setDefault(user, id) };
  }
}

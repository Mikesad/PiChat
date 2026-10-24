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
  UseGuards,
} from "@nestjs/common";
import {
  type CreateSearchConfigRequest,
  isSearchEngineProvider,
  type SearchConfigListResponse,
  type SearchConfigResponse,
  type SearchEngineProviderId,
  type SessionUser,
  type TestSearchConfigRequest,
  type TestSearchConfigResponse,
  type UpdateSearchConfigRequest,
} from "@pichat/shared";
import { z } from "zod";
import { parseBody } from "../../common/validation";
import { CurrentUser } from "../auth/current-user.decorator";
import { SessionGuard } from "../auth/session.guard";
import { SearchConfigsService } from "./search-configs.service";

const providerSchema = z.custom<SearchEngineProviderId>((value) => isSearchEngineProvider(value), {
  message: "不支持的搜索引擎",
});

const proxySchema = z
  .string()
  .trim()
  .max(512)
  .refine(
    (value) => value.length === 0 || /^(https?|socks4|socks4a|socks5|socks5h):\/\//i.test(value),
    "HTTP 代理必须以 http:// 或 https:// 开头",
  );

const createSchema = z.object({
  provider: providerSchema,
  name: z.string().trim().min(1).max(120),
  remark: z.string().trim().max(500).optional(),
  apiKey: z.string().trim().min(1).max(4096),
  proxy: proxySchema.optional(),
  makeDefault: z.boolean().optional(),
});

const updateSchema = z.object({
  provider: providerSchema,
  name: z.string().trim().min(1).max(120),
  remark: z.string().trim().max(500).optional(),
  apiKey: z.string().max(4096).optional(),
  proxy: proxySchema.optional(),
  makeDefault: z.boolean().optional(),
});

const testSchema = z.object({
  id: z.string().min(1).max(36).optional(),
  provider: providerSchema,
  apiKey: z.string().max(4096).optional(),
  proxy: proxySchema.optional(),
});

@Controller("search-configs")
@UseGuards(SessionGuard)
export class SearchConfigsController {
  constructor(
    @Inject(SearchConfigsService) private readonly searchConfigsService: SearchConfigsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: SessionUser): Promise<SearchConfigListResponse> {
    return { searchConfigs: await this.searchConfigsService.list(user) };
  }

  @Post()
  async create(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ): Promise<SearchConfigResponse> {
    const input = parseBody<CreateSearchConfigRequest>(createSchema, body);
    return { searchConfig: await this.searchConfigsService.create(user, input) };
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ): Promise<SearchConfigResponse> {
    const input = parseBody<UpdateSearchConfigRequest>(updateSchema, body);
    const apiKey = input.apiKey?.trim();
    return {
      searchConfig: await this.searchConfigsService.update(user, id, {
        ...input,
        apiKey: apiKey && apiKey.length > 0 ? apiKey : undefined,
      }),
    };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string, @CurrentUser() user: SessionUser): Promise<void> {
    await this.searchConfigsService.remove(user, id);
  }

  @Post(":id/default")
  @HttpCode(HttpStatus.OK)
  async setDefault(
    @Param("id") id: string,
    @CurrentUser() user: SessionUser,
  ): Promise<SearchConfigResponse> {
    return { searchConfig: await this.searchConfigsService.setDefault(user, id) };
  }

  @Post("test")
  @HttpCode(HttpStatus.OK)
  async test(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
  ): Promise<TestSearchConfigResponse> {
    const input = parseBody<TestSearchConfigRequest>(testSchema, body);
    return this.searchConfigsService.test(user, input);
  }
}

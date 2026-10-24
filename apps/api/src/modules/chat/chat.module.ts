import { Module } from "@nestjs/common";
import { AccessControlModule } from "../access-control/access-control.module";
import { ModelConfigsModule } from "../model-configs/model-configs.module";
import { SearchConfigsModule } from "../search-configs/search-configs.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { ChatRuntimeClient } from "./chat-runtime.client";

@Module({
  imports: [AccessControlModule, ModelConfigsModule, SearchConfigsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRuntimeClient],
})
export class ChatModule {}

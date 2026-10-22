import { Module } from "@nestjs/common";
import { ModelConfigsModule } from "../model-configs/model-configs.module";
import { ChatController } from "./chat.controller";
import { ChatService } from "./chat.service";
import { ChatRuntimeClient } from "./chat-runtime.client";

@Module({
  imports: [ModelConfigsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatRuntimeClient],
})
export class ChatModule {}

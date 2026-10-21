import { ConfigService } from "@nestjs/config";
import { ModelConfigCrypto } from "../../common/model-config-crypto";

export const MODEL_CONFIG_CRYPTO = Symbol("MODEL_CONFIG_CRYPTO");

export { ModelConfigCrypto };

export const modelConfigCryptoProvider = {
  provide: MODEL_CONFIG_CRYPTO,
  inject: [ConfigService],
  useFactory: (config: ConfigService): ModelConfigCrypto =>
    ModelConfigCrypto.fromEnvironment(config.get<string>("MODEL_CONFIG_ENCRYPTION_KEY")),
};

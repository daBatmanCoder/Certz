import "@nomicfoundation/hardhat-toolbox";
import "@oasisprotocol/sapphire-hardhat";
import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    // Oasis Sapphire networks. The sapphire-hardhat plugin wraps these so that
    // transactions and calls are end-to-end encrypted (confidential).
    "sapphire-testnet": {
      url: "https://testnet.sapphire.oasis.io",
      chainId: 0x5aff, // 23295
      accounts,
    },
    "sapphire-mainnet": {
      url: "https://sapphire.oasis.io",
      chainId: 0x5afe, // 23294
      accounts,
    },
    // Local sapphire-dev container (oasisprotocol/sapphire-localnet) for fast iteration.
    "sapphire-localnet": {
      url: "http://localhost:8545",
      chainId: 0x5afd, // 23293
      accounts,
    },
  },
};

export default config;

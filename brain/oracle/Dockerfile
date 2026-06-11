# Certz DNS-01 oracle container. In production this image runs inside an Oasis
# ROFL TEE (Intel TDX). Addresses are injected via environment variables so the
# image is network-agnostic.
FROM node:22-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev

COPY oracle.mjs ./

# CERTZ_CA / CERTZ_REGISTRY / CERTZ_RPC / CERTZ_NETWORK come from the ROFL
# manifest env + secrets. PRIVATE_KEY is derived inside the TEE via the ROFL
# key management service (never baked into the image).
ENV CERTZ_NETWORK=sapphire-testnet
CMD ["node", "oracle.mjs", "--mode", "tee", "--watch"]

// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";

/**
 * @title CertzCASigner
 * @notice Phase 1 proof: a certificate-authority signing key that is generated
 *         and held ONLY inside Sapphire's confidential (TEE) state. The private
 *         key never leaves the enclave and is never returned by any function.
 *
 *         The contract signs a pre-computed SHA-256 digest with NIST P-256
 *         (secp256r1) and returns an ASN.1 DER-encoded ECDSA signature -- the
 *         exact format X.509 expects in `signatureValue`. An off-chain tool can
 *         therefore build a TBSCertificate, hash it, ask this contract to sign,
 *         and splice the DER signature straight into a valid certificate.
 *
 * @dev Signing is a `view` call (Sapphire's SIGN_DIGEST precompile is a
 *      staticcall), so issuance needs no on-chain transaction or gas from the
 *      requester -- only bootstrap (key generation) is state-changing.
 */
contract CertzCASigner {
    /// P-256 over a pre-hashed SHA-256 digest (enum index 7 in Sapphire.SigningAlg).
    Sapphire.SigningAlg private constant ALG =
        Sapphire.SigningAlg.Secp256r1PrehashedSha256;

    address public immutable owner;

    /// CA public key, 33-byte SEC1 compressed point (0x02/0x03 prefix + X).
    bytes public caPublicKey;

    /// CA private key. `private` + confidential Sapphire storage => never readable.
    bytes private caSecretKey;

    bool public initialized;

    event CABootstrapped(bytes caPublicKey);

    error AlreadyInitialized();
    error NotInitialized();
    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Generate the CA keypair inside the TEE. Callable once.
     * @dev Uses Sapphire's VRF-backed CSPRNG for the seed; no externally
     *      supplied entropy is trusted.
     */
    function bootstrap() external onlyOwner {
        if (initialized) revert AlreadyInitialized();

        bytes memory seed = Sapphire.randomBytes(32, "certz-ca-keygen");
        (bytes memory pk, bytes memory sk) = Sapphire.generateSigningKeyPair(
            ALG,
            seed
        );

        caPublicKey = pk;
        caSecretKey = sk;
        initialized = true;

        emit CABootstrapped(pk);
    }

    /**
     * @notice Sign a pre-computed SHA-256 digest with the confidential CA key.
     * @param sha256Digest 32-byte SHA-256 hash of the TBSCertificate (or any
     *        payload). Per Sapphire, the digest is passed as `contextOrHash`
     *        and `message` is empty for prehashed algorithms.
     * @return signature ASN.1 DER-encoded ECDSA (P-256) signature.
     */
    function caSign(bytes32 sha256Digest)
        external
        view
        returns (bytes memory signature)
    {
        if (!initialized) revert NotInitialized();
        return
            Sapphire.sign(
                ALG,
                caSecretKey,
                abi.encodePacked(sha256Digest),
                ""
            );
    }
}

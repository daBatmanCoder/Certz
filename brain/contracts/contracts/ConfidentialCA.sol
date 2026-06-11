// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Sapphire} from "@oasisprotocol/sapphire-contracts/contracts/Sapphire.sol";
import {Subcall} from "@oasisprotocol/sapphire-contracts/contracts/Subcall.sol";

interface ICertRegistry {
    function record(
        bytes32 tbsSha256,
        string calldata domain,
        uint64 notAfter
    ) external;
}

/**
 * @title ConfidentialCA
 * @notice The Certz certificate authority. The CA's P-256 signing key is
 *         generated and held ONLY inside Sapphire confidential (TEE) state and
 *         is never returned by any function.
 *
 *         Issuance follows an ACME-style flow:
 *           1. requestCertificate(domain, tbsSha256, notAfter) -> a random
 *              challenge nonce (VRF-backed) the requester must publish as a DNS
 *              TXT record at `_certz-challenge.<domain>`.
 *           2. An Oasis ROFL TEE oracle reads the request, checks the DNS TXT
 *              record, and calls fulfill(requestId). fulfill is gated by
 *              `Subcall.roflEnsureAuthorizedOrigin` so ONLY the attested oracle
 *              can authorize signing.
 *           3. The CA signs the pre-committed TBSCertificate digest and records
 *              the issuance in the public CertRegistry.
 *           4. The requester reads the signature back and assembles the X.509.
 *
 * @dev `devFulfill` exists ONLY for local development before a ROFL oracle is
 *      deployed. It is owner-only and disabled unless `devMode` is true. It is
 *      explicitly NOT for production: it skips trustless DNS verification.
 */
contract ConfidentialCA {
    Sapphire.SigningAlg private constant ALG =
        Sapphire.SigningAlg.Secp256r1PrehashedSha256;

    struct Request {
        string domain;
        bytes32 tbsSha256;
        bytes32 challenge;
        address requester;
        uint64 notAfter;
        bool exists;
        bool fulfilled;
    }

    address public immutable owner;
    ICertRegistry public registry;

    /// The authorized ROFL app id. Issuance via fulfill() requires this origin.
    bytes21 public roflAppId;

    /// DEV ONLY: when true, owner may issue without ROFL DNS verification.
    bool public devMode;

    bytes public caPublicKey; // 33-byte SEC1 compressed P-256 public key
    bytes private caSecretKey; // confidential; never returned
    bool public initialized;

    mapping(bytes32 => Request) private requests; // requestId => Request
    mapping(bytes32 => bytes) private signatures; // requestId => DER signature

    event CABootstrapped(bytes caPublicKey);
    event ChallengeRequested(
        bytes32 indexed requestId,
        string domain,
        bytes32 challenge,
        address indexed requester
    );
    event CertificateIssued(
        bytes32 indexed requestId,
        string domain,
        bytes32 tbsSha256
    );

    error NotOwner();
    error AlreadyInitialized();
    error NotInitialized();
    error UnknownRequest();
    error AlreadyFulfilled();
    error DevModeDisabled();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address registryAddr) {
        owner = msg.sender;
        registry = ICertRegistry(registryAddr);
    }

    // --- Admin / setup -------------------------------------------------------

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

    function setRegistry(address registryAddr) external onlyOwner {
        registry = ICertRegistry(registryAddr);
    }

    /**
     * @notice One-shot: sign the self-signed CA root certificate. The root's
     *         TBSCertificate digest is computed off-chain (subject == issuer ==
     *         the CA). Callable once, owner-only, before it is published.
     * @dev Scoped to a single signature for the self-signed root so it cannot be
     *      abused to mint leaf certificates (those must go through request then
     *      fulfill and are recorded in the public registry).
     */
    bool public rootSigned;
    bytes public rootCertSignature; // DER signature over the root TBS digest
    bytes32 public rootCertTbsSha256;

    function signRootCert(bytes32 rootTbsSha256)
        external
        onlyOwner
        returns (bytes memory)
    {
        if (!initialized) revert NotInitialized();
        require(!rootSigned, "root already signed");
        bytes memory sig = Sapphire.sign(
            ALG,
            caSecretKey,
            abi.encodePacked(rootTbsSha256),
            ""
        );
        rootSigned = true;
        rootCertSignature = sig;
        rootCertTbsSha256 = rootTbsSha256;
        return sig;
    }

    function setRoflAppId(bytes21 appId) external onlyOwner {
        roflAppId = appId;
    }

    /// @notice DEV ONLY. Enables the owner-only devFulfill path.
    function setDevMode(bool enabled) external onlyOwner {
        devMode = enabled;
    }

    // --- Issuance flow -------------------------------------------------------

    /**
     * @notice Step 1: pre-commit to a certificate and obtain a DNS-01 challenge.
     * @param domain The fully-qualified domain name being certified.
     * @param tbsSha256 SHA-256 digest of the TBSCertificate the requester built.
     * @param notAfter Unix expiry that MUST match the certificate's notAfter.
     * @return requestId Handle for this issuance request.
     * @return challenge Nonce to publish at `_certz-challenge.<domain>` TXT.
     */
    function requestCertificate(
        string calldata domain,
        bytes32 tbsSha256,
        uint64 notAfter
    ) external returns (bytes32 requestId, bytes32 challenge) {
        if (!initialized) revert NotInitialized();

        challenge = bytes32(Sapphire.randomBytes(32, "certz-challenge"));
        requestId = keccak256(
            abi.encode(domain, tbsSha256, msg.sender, challenge, block.number)
        );

        requests[requestId] = Request({
            domain: domain,
            tbsSha256: tbsSha256,
            challenge: challenge,
            requester: msg.sender,
            notAfter: notAfter,
            exists: true,
            fulfilled: false
        });

        emit ChallengeRequested(requestId, domain, challenge, msg.sender);
    }

    /**
     * @notice Step 3 (production): called by the attested ROFL oracle after it
     *         has confirmed the DNS-01 TXT record. Gated so only the authorized
     *         ROFL app can trigger signing.
     */
    function fulfill(bytes32 requestId) external {
        Subcall.roflEnsureAuthorizedOrigin(roflAppId);
        _issue(requestId);
    }

    /**
     * @notice DEV ONLY local path. Owner-gated and only when devMode is on.
     *         Skips trustless DNS verification -- never enable in production.
     */
    function devFulfill(bytes32 requestId) external onlyOwner {
        if (!devMode) revert DevModeDisabled();
        _issue(requestId);
    }

    function _issue(bytes32 requestId) internal {
        Request storage r = requests[requestId];
        if (!r.exists) revert UnknownRequest();
        if (r.fulfilled) revert AlreadyFulfilled();

        bytes memory sig = Sapphire.sign(
            ALG,
            caSecretKey,
            abi.encodePacked(r.tbsSha256),
            ""
        );

        r.fulfilled = true;
        signatures[requestId] = sig;

        registry.record(r.tbsSha256, r.domain, r.notAfter);

        emit CertificateIssued(requestId, r.domain, r.tbsSha256);
    }

    // --- Views ---------------------------------------------------------------

    /// @notice Read the DER signature once a request has been fulfilled.
    function getSignature(bytes32 requestId)
        external
        view
        returns (bytes memory)
    {
        Request storage r = requests[requestId];
        if (!r.exists) revert UnknownRequest();
        if (!r.fulfilled) revert UnknownRequest();
        return signatures[requestId];
    }

    function getRequest(bytes32 requestId)
        external
        view
        returns (Request memory)
    {
        return requests[requestId];
    }

    /// @notice The challenge nonce the ROFL oracle must look for in DNS.
    function getChallenge(bytes32 requestId) external view returns (bytes32) {
        return requests[requestId].challenge;
    }
}

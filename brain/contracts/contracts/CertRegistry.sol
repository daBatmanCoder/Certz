// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title CertRegistry
 * @notice Public, auditable registry of certificates issued by the Certz CA.
 *         This is the Certificate-Transparency-style layer: anyone can look up
 *         which certificates exist for a domain and whether they are revoked.
 *
 *         The anchor we store is the SHA-256 digest of the TBSCertificate (the
 *         exact bytes the confidential CA signed). A verifier recomputes that
 *         digest from a presented certificate and checks it is registered and
 *         not revoked. This avoids the circularity of trying to anchor the full
 *         certificate fingerprint (which depends on the signature itself).
 *
 * @dev Writes are restricted to the ConfidentialCA contract. State here is
 *      intentionally transparent (no confidentiality) -- transparency IS the
 *      security property of a CT log.
 */
contract CertRegistry {
    struct Record {
        string domain;
        bytes32 tbsSha256;
        uint64 issuedAt;
        uint64 notAfter;
        bool revoked;
        bool exists;
    }

    address public owner;
    address public ca;

    mapping(bytes32 => Record) private records; // tbsSha256 => Record
    mapping(string => bytes32[]) private byDomain; // domain => tbsSha256[]

    event CertRecorded(bytes32 indexed tbsSha256, string domain, uint64 notAfter);
    event CertRevoked(bytes32 indexed tbsSha256, string domain);
    event CaUpdated(address indexed ca);

    error NotOwner();
    error NotCA();
    error UnknownRecord();
    error AlreadyRecorded();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyCA() {
        if (msg.sender != ca) revert NotCA();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /// @notice Set the ConfidentialCA contract allowed to record issuances.
    function setCA(address _ca) external onlyOwner {
        ca = _ca;
        emit CaUpdated(_ca);
    }

    /// @notice Record a freshly issued certificate. Only callable by the CA.
    function record(
        bytes32 tbsSha256,
        string calldata domain,
        uint64 notAfter
    ) external onlyCA {
        if (records[tbsSha256].exists) revert AlreadyRecorded();

        records[tbsSha256] = Record({
            domain: domain,
            tbsSha256: tbsSha256,
            issuedAt: uint64(block.timestamp),
            notAfter: notAfter,
            revoked: false,
            exists: true
        });
        byDomain[domain].push(tbsSha256);

        emit CertRecorded(tbsSha256, domain, notAfter);
    }

    /// @notice Revoke a certificate. Callable by the CA or the owner.
    function revoke(bytes32 tbsSha256) external {
        if (msg.sender != ca && msg.sender != owner) revert NotCA();
        Record storage r = records[tbsSha256];
        if (!r.exists) revert UnknownRecord();
        r.revoked = true;
        emit CertRevoked(tbsSha256, r.domain);
    }

    /// @notice Look up a single record by its TBSCertificate digest.
    function getRecord(bytes32 tbsSha256) external view returns (Record memory) {
        return records[tbsSha256];
    }

    /// @notice True iff the certificate is recorded, not revoked, and unexpired.
    function isValid(bytes32 tbsSha256) external view returns (bool) {
        Record memory r = records[tbsSha256];
        return r.exists && !r.revoked && block.timestamp <= r.notAfter;
    }

    /// @notice All TBSCertificate digests ever recorded for a domain.
    function digestsForDomain(string calldata domain)
        external
        view
        returns (bytes32[] memory)
    {
        return byDomain[domain];
    }
}

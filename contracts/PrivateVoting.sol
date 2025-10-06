// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract PrivateVoting {
    // Información de la propuesta
    string public proposal;

    // Control de votantes
    address[] public eligibleVoters;
    uint256 public totalEligibleVoters;
    mapping(address => bool) public isEligible;

    // Votos cifrados
    mapping(address => bytes32) public voteHashes;
    mapping(address => bool) public hasVoted;
    mapping(address => uint256) public voteTimestamp;
    uint256 public totalVotesCast;

    // Resultado final
    bytes32 public finalTallyCiphertextHash;
    uint256 public yesVotes;
    uint256 public noVotes;
    bool public tallyRevealed;

    // Control de tiempo
    uint256 public votingStartTime;
    uint256 public votingDeadline;

    // Coordinador
    address public tallyCoordinator;

    // Quórum en basis points (0..10000)
    uint16 public quorumBps;

    // Eventos
    event VoteCast(address indexed voter, uint256 timestamp);
    event TallySubmitted(bytes32 tallyHash, uint256 timestamp);
    event ResultRevealed(uint256 yesVotes, uint256 noVotes, uint256 timestamp);
    event DeadlineExtended(uint256 newDeadline);

    constructor(
        string memory _proposal,
        address _coordinator,
        address[] memory _eligibleVoters,
        uint256 _votingPeriodDays,
        uint16 _quorumBps
    ) {
        require(_quorumBps <= 10000, "quorumBps invalido");
        proposal = _proposal;
        tallyCoordinator = _coordinator;
        eligibleVoters = _eligibleVoters;
        totalEligibleVoters = _eligibleVoters.length;
        quorumBps = _quorumBps;

        for (uint i = 0; i < _eligibleVoters.length; i++) {
            isEligible[_eligibleVoters[i]] = true;
        }

        votingStartTime = block.timestamp;
        votingDeadline = block.timestamp + (_votingPeriodDays * 1 days);
    }

    function castEncryptedVote(bytes32 voteCiphertextHash) public {
        require(block.timestamp <= votingDeadline, "Periodo de votacion terminado");
        require(isEligible[msg.sender], "No estas en la lista de votantes elegibles");
        require(!hasVoted[msg.sender], "Ya votaste");

        voteHashes[msg.sender] = voteCiphertextHash;
        hasVoted[msg.sender] = true;
        voteTimestamp[msg.sender] = block.timestamp;
        totalVotesCast++;

        emit VoteCast(msg.sender, block.timestamp);
    }

    function submitFinalTally(bytes32 _finalTallyHash) public {
        require(msg.sender == tallyCoordinator, "Solo el coordinador puede publicar escrutinio");
        require(block.timestamp > votingDeadline, "Votacion aun en curso");
        require(!tallyRevealed, "Resultado ya revelado");

        // Verificar quórum con basis points
        require(totalEligibleVoters > 0, "Sin elegibles");
        uint256 participationBp = (totalVotesCast * 10000) / totalEligibleVoters;
        require(participationBp >= quorumBps, "Quorum no alcanzado");

        finalTallyCiphertextHash = _finalTallyHash;
        emit TallySubmitted(_finalTallyHash, block.timestamp);
    }

    function revealResult(uint256 _yesVotes, uint256 _noVotes) public {
        require(msg.sender == tallyCoordinator, "Solo el coordinador puede revelar");
        require(finalTallyCiphertextHash != bytes32(0), "Primero debe publicarse el escrutinio");
        require(!tallyRevealed, "Resultado ya revelado");
        require(_yesVotes + _noVotes == totalVotesCast, "Total de votos no coincide");

        yesVotes = _yesVotes;
        noVotes = _noVotes;
        tallyRevealed = true;

        emit ResultRevealed(_yesVotes, _noVotes, block.timestamp);
    }

    function extendDeadline(uint256 _additionalDays) public {
        require(msg.sender == tallyCoordinator, "Solo el coordinador");
        require(block.timestamp <= votingDeadline, "Votacion ya termino");
        votingDeadline += (_additionalDays * 1 days);
        emit DeadlineExtended(votingDeadline);
    }

    // ===== CONSULTAS =====
    function getResults() public view returns (
        uint256 yes,
        uint256 no,
        bool revealed,
        string memory proposalText,
        uint256 totalVotes
    ) {
        return (yesVotes, noVotes, tallyRevealed, proposal, totalVotesCast);
    }

    function getParticipationRate() public view returns (
        uint256 voted,
        uint256 total,
        uint256 percentage
    ) {
        voted = totalVotesCast;
        total = totalEligibleVoters;
        percentage = total > 0 ? (voted * 100) / total : 0;
        return (voted, total, percentage);
    }

    function getMissingVoters() public view returns (address[] memory) {
        require(totalEligibleVoters <= 100, "Lista demasiado grande, usar off-chain");
        uint256 missingCount = totalEligibleVoters - totalVotesCast;
        address[] memory missing = new address[](missingCount);
        uint256 index = 0;
        for (uint i = 0; i < eligibleVoters.length; i++) {
            if (!hasVoted[eligibleVoters[i]]) {
                missing[index] = eligibleVoters[i];
                index++;
            }
        }
        return missing;
    }

    function getVotingStatus() public view returns (
        bool active,
        uint256 timeRemaining,
        uint256 votesNeededForQuorum
    ) {
        active = block.timestamp <= votingDeadline;
        timeRemaining = active ? votingDeadline - block.timestamp : 0;

        // votos necesarios = techo(quorumBps * elegibles / 10000)
        uint256 needed = (uint256(quorumBps) * totalEligibleVoters + 9999) / 10000;
        votesNeededForQuorum = totalVotesCast >= needed ? 0 : needed - totalVotesCast;

        return (active, timeRemaining, votesNeededForQuorum);
    }

    function getVoterInfo(address voter) public view returns (
        bool eligible,
        bool voted,
        uint256 timestamp
    ) {
        return (isEligible[voter], hasVoted[voter], voteTimestamp[voter]);
    }

    // Helper (no usado ahora, lo puedes borrar si quieres)
    function uint2str(uint _i) internal pure returns (string memory) {
        if (_i == 0) return "0";
        uint j = _i;
        uint len;
        while (j != 0) { len++; j /= 10; }
        bytes memory bstr = new bytes(len);
        uint k = len;
        while (_i != 0) {
            k = k-1;
            uint8 temp = (48 + uint8(_i - _i / 10 * 10));
            bstr[k] = bytes1(temp);
            _i /= 10;
        }
        return string(bstr);
    }
}

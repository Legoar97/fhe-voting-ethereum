// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract PublicVoting {
    // Información de la propuesta
    string public proposal;

    // Control de votantes
    address[] public eligibleVoters;
    uint256 public totalEligibleVoters;
    mapping(address => bool) public isEligible;

    // Votos (en claro)
    mapping(address => bool) public hasVoted;
    mapping(address => uint256) public voteTimestamp;
    mapping(address => bool) public voterChoice;  // true = SÍ, false = NO
    uint256 public totalVotesCast;

    // Resultados
    uint256 public yesVotes;
    uint256 public noVotes;

    // Control de tiempo
    uint256 public votingStartTime;
    uint256 public votingDeadline;

    // Quórum en basis points (0..10000)
    uint16 public quorumBps;

    // Eventos
    event VoteCast(address indexed voter, bool choice, uint256 timestamp);

    constructor(
        string memory _proposal,
        address[] memory _eligibleVoters,
        uint256 _votingPeriodDays,
        uint16 _quorumBps
    ) {
        require(_quorumBps <= 10000, "quorumBps invalido");
        proposal = _proposal;
        eligibleVoters = _eligibleVoters;
        totalEligibleVoters = _eligibleVoters.length;
        quorumBps = _quorumBps;

        for (uint i = 0; i < _eligibleVoters.length; i++) {
            isEligible[_eligibleVoters[i]] = true;
        }

        votingStartTime = block.timestamp;
        votingDeadline = block.timestamp + (_votingPeriodDays * 1 days);
    }

    function vote(bool supportsProposal) public {
        require(block.timestamp <= votingDeadline, "Periodo de votacion terminado");
        require(isEligible[msg.sender], "No estas en la lista de votantes elegibles");
        require(!hasVoted[msg.sender], "Ya votaste");

        hasVoted[msg.sender] = true;
        voterChoice[msg.sender] = supportsProposal;
        voteTimestamp[msg.sender] = block.timestamp;
        totalVotesCast++;

        if (supportsProposal) {
            yesVotes++;
        } else {
            noVotes++;
        }

        emit VoteCast(msg.sender, supportsProposal, block.timestamp);
    }

    // Consulta de resultados
    function getResults() public view returns (
        uint256 yes,
        uint256 no,
        string memory proposalText,
        uint256 totalVotes
    ) {
        return (yesVotes, noVotes, proposal, totalVotesCast);
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

    function getVotingStatus() public view returns (
        bool active,
        uint256 timeRemaining
    ) {
        active = block.timestamp <= votingDeadline;
        timeRemaining = active ? votingDeadline - block.timestamp : 0;
        return (active, timeRemaining);
    }

    function getVoterInfo(address voter) public view returns (
        bool eligible,
        bool voted,
        bool choice,
        uint256 timestamp
    ) {
        return (isEligible[voter], hasVoted[voter], voterChoice[voter], voteTimestamp[voter]);
    }

    // Útil para reportes: ¿se alcanzó el quórum?
    function hasQuorum() public view returns (bool) {
        if (totalEligibleVoters == 0) return false;
        uint256 participationBp = (totalVotesCast * 10000) / totalEligibleVoters;
        return participationBp >= quorumBps;
    }
}

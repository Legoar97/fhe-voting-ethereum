require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      accounts: {
        count: 500  // Cambiar el número de cuentas según sea necesario, el valor predeterminado es 20
      }
    }
  }
};
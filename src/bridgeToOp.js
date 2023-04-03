const { ethers } = require("ethers");
const {
  DefenderRelaySigner,
  DefenderRelayProvider,
} = require("defender-relay-client/lib/ethers");

const addressMap = {
  1: {},
  5: {
    treasuryAddr: "",
    connectorAddr: "0xeC2372EA217437585576cCe877d5B345a743700F",
    unionAddr: "0x23B0483E07196c425d771240E81A9c2f1E113D3A",
  },
};

exports.handler = async function (payload) {
  const provider = new DefenderRelayProvider(payload);
  const signer = new DefenderRelaySigner(payload, provider, {
    speed: "average",
  });

  const content = payload.request.body;
  const events = content.events;
  for (const evt of events) {
    const sentinel = evt.sentinel;
    const addresses = addressMap[sentinel.chainId];
    // Step 1: Drip Union to ArbConnector
    const treasury = new ethers.Contract(
      addresses.treasuryAddr,
      TREASURY_ABI,
      signer
    );
    const dripTx = await treasury.drip(addresses.connectorAddr);
    await dripTx.wait();

    const union = new ethers.Contract(addresses.unionAddr, ERC20_ABI, signer);
    const balanceOfUnion = await union.balanceOf(addresses.connectorAddr);
    console.log(
      `Connector UNION balance: ${ethers.utils.formatEther(balanceOfUnion)}`
    );
    // Don't bridge if the balance is too small
    if (balanceOfUnion.lte(ethers.utils.parseEther("100"))) return;

    // Step 2: Bridge to Optimism
    const connector = new ethers.Contract(
      addresses.connectorAddr,
      CONNECTOR_ABI,
      signer
    );
    const bridgeTx = await connector.bridge();
    console.log(
      `Send Union to Op succeeded! 🙌 ${
        (await bridgeTx.wait()).transactionHash
      }`
    );
  }
  return { matches };
};

const TREASURY_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "target",
        type: "address",
      },
    ],
    name: "drip",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
];

const CONNECTOR_ABI = [
  {
    inputs: [
      {
        internalType: "uint256",
        name: "maxGas",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "gasPriceBid",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "maxSubmissionCost",
        type: "uint256",
      },
    ],
    name: "bridge",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
];

const ERC20_ABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "balanceOf",
    outputs: [
      {
        internalType: "uint256",
        name: "",
        type: "uint256",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
];

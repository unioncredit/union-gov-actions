const { ethers } = require("ethers");
const {
  DefenderRelaySigner,
  DefenderRelayProvider,
} = require("defender-relay-client/lib/ethers");

const TREASURY_ADDR = "0x8Cf2D155D1b789C72403BAdB33E85664cEF84e6B";
const CONNECTOR_ADDR = "0xf8e49fAB23884AdFF5499D841010052Ae08Ac8F8";
const UNION_ADDRESS = "0x23B0483E07196c425d771240E81A9c2f1E113D3A";

exports.handler = async function (payload) {
  const provider = new DefenderRelayProvider(payload);
  const signer = new DefenderRelaySigner(payload, provider, {
    speed: "average",
  });

  // Step 1: Drip Union to ArbConnector
  const treasury = new ethers.Contract(TREASURY_ADDR, TREASURY_ABI, signer);
  const dripTx = await treasury.drip(CONNECTOR_ADDR);
  await dripTx.wait();

  const union = new ethers.Contract(UNION_ADDRESS, ERC20_ABI, signer);
  const balanceOfUnion = await union.balanceOf(CONNECTOR_ADDR);
  console.log(
    `Connector UNION balance: ${ethers.utils.formatEther(balanceOfUnion)}`
  );
  // Don't bridge if the balance is too small
  if (balanceOfUnion.lte(ethers.utils.parseEther("100"))) return;

  // Step 2: Bridge to Optimism
  const connector = new ethers.Contract(CONNECTOR_ADDR, CONNECTOR_ABI, signer);
  const bridgeTx = await connector.bridge();
  console.log(
    `Send Union to Op succeeded! 🙌 ${(await bridgeTx.wait()).transactionHash}`
  );
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

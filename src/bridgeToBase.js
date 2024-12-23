const { ethers } = require("ethers");
const {
  DefenderRelaySigner,
  DefenderRelayProvider,
} = require("defender-relay-client/lib/ethers");

const CONTRACTS = {
  // mainnet
  1: {
    UNION_TOKEN: "0x5Dfe42eEA70a3e6f93EE54eD9C321aF07A85535C",
    CONNECTOR: "0x36b36B9914758560Cc7412E1c98763fD7c0FBECA",
    TREASURY: "0x6DBDe0E7e563E34A53B1130D6B779ec8eD34B4B9",
  },
};

exports.handler = async function (payload) {
  const provider = new DefenderRelayProvider(payload);
  const { chainId } = await provider.getNetwork();
  console.log({ chainId });
  const signer = new DefenderRelaySigner(payload, provider, {
    speed: "average",
  });

  // Step 1: Drip Union to OpConnector
  const treasury = new ethers.Contract(
    CONTRACTS[chainId]["TREASURY"],
    TREASURY_ABI,
    signer
  );
  const CONNECTOR_ADDR = CONTRACTS[chainId]["CONNECTOR"];
  const dripTx = await treasury.drip(CONNECTOR_ADDR);
  await dripTx.wait();

  const union = new ethers.Contract(
    CONTRACTS[chainId]["UNION_TOKEN"],
    ERC20_ABI,
    signer
  );
  const balanceOfUnion = await union.balanceOf(CONNECTOR_ADDR);
  console.log(
    `Connector UNION balance: ${ethers.utils.formatEther(balanceOfUnion)}`
  );
  // Don't bridge if the balance is too small
  if (balanceOfUnion.lte(ethers.utils.parseEther("100"))) return;

  // Step 2: Bridge to Base
  const connector = new ethers.Contract(CONNECTOR_ADDR, CONNECTOR_ABI, signer);
  const bridgeTx = await connector.bridge();
  console.log(
    `Send Union to Base succeeded! 🙌 ${
      (await bridgeTx.wait()).transactionHash
    }`
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
    inputs: [],
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

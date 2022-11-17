const { providers, ethers } = require("ethers");
const {
  DefenderRelaySigner,
  DefenderRelayProvider,
} = require("defender-relay-client/lib/ethers");
const {
  L1ToL2MessageGasEstimator,
} = require("@arbitrum/sdk/dist/lib/message/L1ToL2MessageGasEstimator");

const encodeParameters = (types, values) => {
  const abi = new ethers.utils.AbiCoder();
  return abi.encode(types, values);
};

//mainnet
const TREASURY_ADDR = "0x6DBDe0E7e563E34A53B1130D6B779ec8eD34B4B9";
const CONNECTOR_ADDR = "0x307ED81138cA91637E432DbaBaC6E3A42699032a";
const UNION_ADDRESS = "0x5Dfe42eEA70a3e6f93EE54eD9C321aF07A85535C";

exports.handler = async function (payload) {
  const { INFURA_ID } = payload.secrets;
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

  // Step 2: Bridge to Arbitrum

  let l1Provider, l2Provider;
  l1Provider = new providers.JsonRpcProvider(
    "https://mainnet.infura.io/v3/" + INFURA_ID
  );
  l2Provider = new providers.JsonRpcProvider("https://arb1.arbitrum.io/rpc");
  const dripToComptrollerBytes = encodeParameters(
    ["uint256"],
    ["800000000000000000"]
  );
  const dripToComptrollerBytesLength =
    ethers.utils.hexDataLength(dripToComptrollerBytes) + 4;
  const l1ToL2MessageGasEstimate = new L1ToL2MessageGasEstimator(l2Provider);
  console.log(`dripToComptrollerBytesLength:${dripToComptrollerBytesLength}`);
  const _submissionPriceWei =
    await l1ToL2MessageGasEstimate.estimateSubmissionFee(
      l1Provider,
      await l1Provider.getGasPrice(),
      dripToComptrollerBytesLength
    );
  console.log(`_submissionPriceWei:${_submissionPriceWei}`);
  const submissionPriceWei = _submissionPriceWei.mul(5);
  const maxGas = 275000;
  const gasPriceBid = await l2Provider.getGasPrice();
  const callValue = submissionPriceWei.add(gasPriceBid.mul(maxGas));

  console.log({
    gasPriceBid: gasPriceBid.toString(),
    submissionPriceWei: submissionPriceWei.toString(),
    callValue: callValue.toString(),
  });

  const connector = new ethers.Contract(CONNECTOR_ADDR, CONNECTOR_ABI, signer);
  const bridgeTx = await connector.bridge(
    maxGas,
    gasPriceBid,
    submissionPriceWei,
    {
      value: callValue,
    }
  );

  console.log(
    `Send Union to Arbitrum succeeded! 🙌 ${
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

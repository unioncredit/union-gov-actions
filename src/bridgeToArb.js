const { providers, ethers, Wallet } = require("ethers");
const {
  DefenderRelaySigner,
  DefenderRelayProvider,
} = require("defender-relay-client/lib/ethers");
const { Bridge } = require("arb-ts");
const { hexDataLength } = require("@ethersproject/bytes");
const walletPrivateKey = process.env.PRIVATE_KEY;

const encodeParameters = (types, values) => {
  const abi = new ethers.utils.AbiCoder();
  return abi.encode(types, values);
};

//rinkeby
const TREASURY_ADDR = "0xC3FdB85912a2f64FC5eDB0f6c775B33B22317F89";
const CONNECTOR_ADDR = "0xA5770c37B6824f47ac9480F0bE30E2Da6b8Bc199";

exports.handler = async function (payload) {
  const content = payload.request.body;
  const sentinel = content.sentinel;
  const chainId = sentinel.chainId;

  const provider = new DefenderRelayProvider(payload);
  const signer = new DefenderRelaySigner(payload, provider, {
    speed: "fast",
  });

  let l1Provider, l2Provider;
  if (chainId == 1) {
    l1Provider = new providers.JsonRpcProvider(
      "https://mainnet.infura.io/v3/" + process.env.INFURA_ID
    );
    l2Provider = new providers.JsonRpcProvider("https://arb1.arbitrum.io/rpc");
  } else if (chainId == 4) {
    l1Provider = new providers.JsonRpcProvider(
      "https://rinkeby.infura.io/v3/" + process.env.INFURA_ID
    );
    l2Provider = new providers.JsonRpcProvider(
      "https://rinkeby.arbitrum.io/rpc"
    );
  } else {
    throw new Error("network not support");
  }
  const l1Wallet = new Wallet(walletPrivateKey, l1Provider);
  const l2Wallet = new Wallet(walletPrivateKey, l2Provider);

  const bridge = await Bridge.init(l1Wallet, l2Wallet);

  const dripToComptrollerBytes = encodeParameters(
    ["uint256"],
    ["800000000000000000"]
  );
  const dripToComptrollerBytesLength =
    hexDataLength(dripToComptrollerBytes) + 4;

  const [_submissionPriceWei] = await bridge.l2Bridge.getTxnSubmissionPrice(
    dripToComptrollerBytesLength
  );

  const submissionPriceWei = _submissionPriceWei.mul(5);
  const maxGas = 275000;
  let gasPriceBid = await bridge.l2Provider.getGasPrice();
  //gasPriceBid = gasPriceBid.mul(ethers.BigNumber.from("2"));
  const callValue = submissionPriceWei.add(gasPriceBid.mul(maxGas));

  console.log({
    gasPriceBid: gasPriceBid.toString(),
    submissionPriceWei: submissionPriceWei.toString(),
    callValue: callValue.toString(), //ethers.utils.formatUnits(callValue)
  });

  const treasury = new ethers.Contract(TREASURY_ADDR, TREASURY_ABI, signer);
  await treasury.dirp(CONNECTOR_ADDR);

  const connector = await ethers.getContract(
    CONNECTOR_ADDR,
    CONNECTOR_ABI,
    signer
  );
  const tx = await connector.bridge(maxGas, gasPriceBid, submissionPriceWei, {
    value: callValue,
  });

  console.log(
    `Send Union to Arbitrum succeeded! 🙌 ${(await tx.wait()).transactionHash}`
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

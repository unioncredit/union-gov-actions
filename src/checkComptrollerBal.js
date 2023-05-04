const { ethers } = require("ethers");

const formatUnits = ethers.utils.formatUnits;
const parseUnits = ethers.utils.parseUnits;

const CONTRACTS = {
  // mainnet
  1: {
    UNION_TOKEN: "0x5Dfe42eEA70a3e6f93EE54eD9C321aF07A85535C",
    COMPTROLLER: "0x216dE4089dCdD7B95BC34BdCe809669C788a9A5d",
  },
  // optimism
  10: {
    UNION_TOKEN: "0xB025ee78b54B5348BD638Fe4a6D77Ec2F813f4f9",
    COMPTROLLER: "0x06a31efa04453C5F9C0A711Cdb96075308C9d6E3",
  },
  // arbitrum
  42161: {
    UNION_TOKEN: "0x6DBDe0E7e563E34A53B1130D6B779ec8eD34B4B9",
    COMPTROLLER: "0x641DD6258cb3E948121B10ee51594Dc2A8549fe1",
  },
  // optimism goerli
  420: {
    UNION_TOKEN: "0xa5DaCCAf7E72Be629fc0F52cD55d500Fd6fa7677",
    COMPTROLLER: "0x4A89d70e17F9e765077dfF246c84B47c1181c473",
  },
};

const RPC_URLS = {
  // mainnet
  1: "https://mainnet.infura.io/v3/{INFURA_KEY}",
  // optimism
  10: "https://optimism-mainnet.infura.io/v3/{INFURA_KEY}",
  // arbitrum
  42161: "https://arb1.arbitrum.io/rpc",
  // optimism goerli
  420: "https://goerli.optimism.io",
};

exports.handler = async function (payload) {
  const matches = [];
  const { UNION_INFURA_KEY } = payload.secrets;

  const conditionRequest = payload.request.body;
  const events = conditionRequest.events;

  for (const evt of events) {
    // add custom logic for matching here
    const sentinel = evt.sentinel;
    // console.log({ sentinel });
    // console.log({ tx: evt.transaction });
    const [match] = evt.matchReasons;
    // console.log({ match });

    const chainId = sentinel.chainId;

    if (!CONTRACTS[chainId] || !RPC_URLS[chainId]) continue;

    console.log({
      UNION: CONTRACTS[chainId]["UNION_TOKEN"],
      COMPTROLLER: CONTRACTS[chainId]["COMPTROLLER"],
    });

    const { _, amount } = match.params;
    const rpc_url = RPC_URLS[chainId].replace("{INFURA_KEY}", UNION_INFURA_KEY);
    console.log(rpc_url);
    const provider = new ethers.providers.JsonRpcProvider(rpc_url);

    const union = new ethers.Contract(
      CONTRACTS[chainId]["UNION_TOKEN"],
      ERC20_ABI,
      provider
    );
    const compBal = await union.balanceOf(CONTRACTS[chainId]["COMPTROLLER"]);

    const percent = parseUnits("1").mul(amount).div(compBal.add(amount));

    console.log({ percent: formatUnits(percent) });

    if (percent.gte(parseUnits("0.01"))) {
      // Only match when the withdrawal amount is greater than 1%
      matches.push({
        hash: evt.hash,
        metadata: {
          timestamp: parseInt(new Date().getTime() / 1000),
          comptrollerBal: formatUnits(compBal),
          claimAmount: formatUnits(amount),
          dropPercent: formatUnits(percent),
        },
      });
    }
  }
  return { matches };
};

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

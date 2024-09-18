"use strict";

const { ethers } = require("ethers");
const {
  DefenderRelaySigner,
  DefenderRelayProvider,
} = require("defender-relay-client/lib/ethers");
const { request, gql } = require("graphql-request");
const Interface = ethers.utils.Interface;

const GRAPH_URLS = {
  1: "https://api.studio.thegraph.com/query/78581/union-v1-mainnet/version/latest",
  10: "https://api.studio.thegraph.com/query/78581/union-finance/version/latest",
};

const addresses = {
  10: {
    uTokenAddress: "0xE478b5e7A423d7CDb224692d0a816CA146A744b2",
    userManagerAddress: "0x8E195D65b9932185Fcc76dB5144534e0f3597628",
    multicallAddress: "0xca11bde05977b3631167028862be2a173976ca11",
  },
};

exports.handler = async function (event) {
  // Initialize defender relayer provider and signer
  const provider = new DefenderRelayProvider(event);
  const signer = new DefenderRelaySigner(event, provider, { speed: "fast" });

  const { chainId } = await provider.getNetwork();
  console.log(`chainId: ${chainId}`);

  const uToken = new ethers.Contract(
    addresses[chainId].uTokenAddress,
    uTokenABI,
    signer
  );
  const userManager = new ethers.Contract(
    addresses[chainId].userManagerAddress,
    userManagerABI,
    signer
  );
  const multicall = new ethers.Contract(
    addresses[chainId].multicallAddress,
    multicallABI,
    signer
  );

  const borrowQuery = gql`
    query ($first: Int) {
      borrow: borrowers(first: $first) {
        account
      }
    }
  `;

  const borrowerQuery = await request(GRAPH_URLS[chainId], borrowQuery, {
    first: 1000,
  });
  const borrowers = borrowerQuery.borrow;
  console.log("borrowers length");
  console.log(borrowers.length);

  let debtWriteOffArray = [];
  const promises = Array.from(borrowers).map(async (borrower) => {
    const account = borrower.account;
    const isOverdue = await uToken.checkIsOverdue(account);
    if (isOverdue) {
      let toDebtWriteOff = true;
      const borrowMinAmountLimit = ethers.BigNumber.from("1000000000000000000"); //1 dai
      const borrowMaxAmountLimit = ethers.BigNumber.from(
        "100000000000000000000"
      ); //100 dai

      //Publicly writeoffable
      const currTime = Math.floor(new Date().getTime() / 1000);
      let maxOverdueTime = await userManager.maxOverdueTime();
      maxOverdueTime = parseInt(maxOverdueTime.toString());
      let overdueTime = await uToken.overdueTime();
      overdueTime = parseInt(overdueTime.toString());
      let lastRepay = await uToken.getLastRepay(account);
      lastRepay = parseInt(lastRepay.toString());
      if (currTime <= lastRepay + overdueTime + maxOverdueTime)
        toDebtWriteOff = false;

      //balance owed >=1 dai and <= 100
      const borrowedAmount = await uToken.borrowBalanceView(account);
      if (
        borrowedAmount.lt(borrowMinAmountLimit) ||
        borrowedAmount.gt(borrowMaxAmountLimit)
      ) {
        toDebtWriteOff = false;
      }

      if (toDebtWriteOff) {
        const result = await userManager.vouchers(account, 0);
        debtWriteOffArray.push({
          stakerAddress: result.staker,
          borrowerAddress: account,
          amount: result.locked.toString(),
        });
      }
    }
  });
  await Promise.all(promises);
  console.log("debtWriteOffArray length");
  console.log(debtWriteOffArray.length);

  let contractCallContext = [];
  const iface = new Interface([
    `function debtWriteOff(address,address,uint256) external`,
  ]);
  for (let i = 0; i < debtWriteOffArray.length; i++) {
    const encoded = iface.encodeFunctionData(
      "debtWriteOff(address,address,uint256)",
      [
        debtWriteOffArray[i].stakerAddress,
        debtWriteOffArray[i].borrowerAddress,
        debtWriteOffArray[i].amount,
      ]
    );
    contractCallContext.push([addresses[chainId].userManagerAddress, encoded]);
  }
  const chunks = [];
  const chunkSize = 10;
  for (let i = 0; i < contractCallContext.length; i += chunkSize) {
    chunks.push(contractCallContext.slice(i, i + chunkSize));
  }
  console.log(chunks);
  for (let i = 0; i < chunks.length; i++) {
    await multicall.tryBlockAndAggregate(false, chunks[i]);
  }
};

const userManagerABI = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "getStakerBalance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "maxOverdueTime",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "borrower", type: "address" }],
    name: "getVoucherCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "stakerAddress", type: "address" },
      { internalType: "address", name: "borrowerAddress", type: "address" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "debtWriteOff",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "address", name: "", type: "address" },
      { internalType: "uint256", name: "", type: "uint256" },
    ],
    name: "vouchers",
    outputs: [
      { internalType: "address", name: "staker", type: "address" },
      { internalType: "uint96", name: "trust", type: "uint96" },
      { internalType: "uint96", name: "locked", type: "uint96" },
      { internalType: "uint64", name: "lastUpdated", type: "uint64" },
    ],
    stateMutability: "view",
    type: "function",
  },
];

const uTokenABI = [
  {
    inputs: [
      {
        internalType: "address",
        name: "account",
        type: "address",
      },
    ],
    name: "checkIsOverdue",
    outputs: [
      {
        internalType: "bool",
        name: "isOverdue",
        type: "bool",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "borrowBalanceView",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "overdueTime",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "getLastRepay",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];

const multicallABI = [
  {
    inputs: [
      { internalType: "bool", name: "requireSuccess", type: "bool" },
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "bytes", name: "callData", type: "bytes" },
        ],
        internalType: "struct Multicall3.Call[]",
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "tryBlockAndAggregate",
    outputs: [
      { internalType: "uint256", name: "blockNumber", type: "uint256" },
      { internalType: "bytes32", name: "blockHash", type: "bytes32" },
      {
        components: [
          { internalType: "bool", name: "success", type: "bool" },
          { internalType: "bytes", name: "returnData", type: "bytes" },
        ],
        internalType: "struct Multicall3.Result[]",
        name: "returnData",
        type: "tuple[]",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
];

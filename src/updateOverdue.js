const { ethers } = require("ethers");
const {
  DefenderRelaySigner,
  DefenderRelayProvider,
} = require("defender-relay-client/lib/ethers");
const { request, gql } = require("graphql-request");
const uTokenAddress = "0x95b43b1555653C721aE1FA22d8B6fF1348d9eF33"; //op-goerli
const userManagerAddress = "0x52A2b6BEE1f7Dd4EE48F27C0cAbb9B4A45b2D82d"; //op-goerli
const URL = "https://api.thegraph.com/subgraphs/name/geraldhost/union-goerli";

exports.handler = async function (event) {
  // Initialize defender relayer provider and signer
  const provider = new DefenderRelayProvider(event);
  const signer = new DefenderRelaySigner(event, provider, { speed: "fast" });

  const uToken = new ethers.Contract(uTokenAddress, uTokenABI, signer);
  const userManager = new ethers.Contract(
    userManagerAddress,
    userManagerABI,
    signer
  );

  const borrowQuery = gql`
    query ($first: Int) {
      borrow: borrowers(first: $first) {
        account
      }
    }
  `;

  const borrowerQuery = await request(URL, borrowQuery, {
    first: 1000,
  });
  const borrowers = borrowerQuery.borrow;
  console.log({ borrowers });

  let overdueBorrowers = [],
    stakers = [];
  const promises = Array.from(borrowers).map(async (borrower) => {
    const account = borrower.account;
    const isOverdue = await uToken.checkIsOverdue(account);
    if (isOverdue) {
      overdueBorrowers.push(account);
    }
  });
  await Promise.all(promises);

  console.log({ overdueBorrowers });

  for (let i = 0; i < overdueBorrowers.length; i++) {
    const borrower = overdueBorrowers[i];
    const query = gql`
      query (
        $first: Int
        $vouchCancellationsFilter: VouchCancellation_filter
        $trustLinesFilter: TrustLine_filter
        $trustLinesFilter_Vouch: TrustLine_filter
      ) {
        cancel: vouchCancellations(
          first: $first
          where: $vouchCancellationsFilter
        ) {
          borrower
          staker
        }
        trust: trustLines(first: $first, where: $trustLinesFilter) {
          borrower
          staker
        }
      }
    `;
    const variables = {
      first: 1000,
      trustLinesFilter: {
        borrower,
      },
    };
    const res = await request(URL, query, variables);
    for (let i = 0; i < res.trust.length; i++) {
      const staker = res.trust[i].staker.toLowerCase();
      if (stakers.indexOf(staker) == -1) {
        stakers.push(staker);
      }
    }
  }

  console.log({ stakers });

  if (stakers.length > 0) {
    const tx = await userManager.batchUpdateFrozenInfo(stakers);
    console.log(`Called updateOverdueInfo in ${tx.hash}`);
    return { tx: tx.hash, overdueBorrowers, stakers };
  } else {
    return { overdueBorrowers, stakers };
  }
};

const userManagerABI = [
  {
    inputs: [
      {
        internalType: "address[]",
        name: "stakerList",
        type: "address[]",
      },
    ],
    name: "batchUpdateFrozenInfo",
    outputs: [],
    stateMutability: "nonpayable",
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
];

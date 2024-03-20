const { ethers } = require("ethers");

const U_DAI_ABI = [
  "event LogBorrow(address indexed account, address indexed to, uint256 amount, uint256 fee)",
];

exports.handler = async function (payload) {
  const matches = [];

  const uDaiInterface = new ethers.utils.Interface(U_DAI_ABI);

  const conditionRequest = payload.request.body;
  const events = conditionRequest.events;

  for (const evt of events) {
    let received = 0;

    const logs = evt.transaction.logs;
    // console.log({ logs });

    // find the LogBorrow event and get the actual received amount
    for (const log of logs) {
      try {
        const logBorrow = uDaiInterface.parseLog(log);
        console.log({ args: logBorrow.args });
        received = logBorrow.args.amount.toString();
        break;
      } catch (e) {
        if (e.reason != "no matching event") console.log({ e });
      }
    }
    console.log({ received });

    const [match] = evt.matchReasons;
    const { to, amount } = match.params;
    console.log({ to, amount });

    if (received != amount) {
      matches.push({
        hash: evt.hash,
        metadata: {
          timestamp: parseInt(new Date().getTime() / 1000),
          to,
          amount,
          received,
        },
      });
    }
  }

  return matches;
};

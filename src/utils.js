const asyncWaitFor = condition => 
  new Promise(resolve => {
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval)
        resolve()
      }
    }, 100)
  })

module.exports = { asyncWaitFor }
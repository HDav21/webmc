customEvents.on('mineflayerBotCreated', () => {
  const CHANNEL_NAME = 'minecraft-web-client:blockmodels'

  const packetStructure = [
    'container',
    [
      {
        name: 'worldName',
        type: ['pstring', { countType: 'i16' }]
      },
      {
        name: 'x',
        type: 'i32'
      },
      {
        name: 'y',
        type: 'i32'
      },
      {
        name: 'z',
        type: 'i32'
      },
      {
        name: 'model',
        type: ['pstring', { countType: 'i16' }]
      }
    ]
  ]

  bot._client.registerChannel(CHANNEL_NAME, packetStructure)

  bot._client.on(CHANNEL_NAME as any, (data) => {

    console.log('received raw data:', data)
    const { worldName, x, y, z, model } = data
    console.log('Received model data:', { worldName, x, y, z, model })
  })

  console.log(`registered ${CHANNEL_NAME} channel`)
})

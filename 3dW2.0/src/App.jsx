import Scene from './components/Scene'
import InventoryForm from './components/InventoryForm'

function App() {
  return (
    <div className="app">
      <div className="sidebar">
        <InventoryForm />
      </div>
      <div className="scene-container">
        <Scene />
      </div>
    </div>
  )
}

export default App
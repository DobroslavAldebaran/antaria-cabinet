import { useSearchParams } from 'react-router-dom'
import { useCabinet } from '../cabinet/CabinetProvider'
import { CharactersPanel } from '../components/CharactersPanel'
import { Onboarding } from './Onboarding'

export function CharactersPage() {
  const { binding, data } = useCabinet()
  const [searchParams] = useSearchParams()

  if (!binding || !data || !data.characters) return <Onboarding />

  return (
    <div className="page page-wide">
      <div className="panel">
        <h2>Персонажи</h2>
        <p className="muted">
          Карточки персонажей: имя, подпись, описание и аватар. Черновик пишется на
          Drive автоматически.
        </p>
        <CharactersPanel initialSelectedId={searchParams.get('id')} />
      </div>
    </div>
  )
}

import { LoadingState } from './ui/Feedback'

export function LoadingScreen() {
  return (
    <LoadingState
      fullScreen
      title="Checking your Horizon session"
      description="Restoring your secure staff access."
    />
  )
}

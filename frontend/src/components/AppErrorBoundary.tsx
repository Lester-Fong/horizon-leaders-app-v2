import { Component, type ReactNode } from 'react'

import { ErrorState } from './ui/Feedback'
import { LinkButton } from './ui/Button'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10 sm:px-6">
          <div className="w-full max-w-2xl">
            <ErrorState
              title="Horizon ran into a problem"
              description="The page could not be displayed. Return to the Dashboard and try again."
              action={
                <LinkButton
                  to="/"
                  onClick={() => this.setState({ hasError: false })}
                >
                  Return to Dashboard
                </LinkButton>
              }
            />
          </div>
        </main>
      )
    }

    return this.props.children
  }
}

import { useState, useEffect } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T) {
  // Get from local storage then parse stored json or return initialValue
  const readValue = (): T => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.warn('[WAVETEK] storage read failed <ENCRYPTED>')
      return initialValue
    }
  }

  const [storedValue, setStoredValue] = useState<T>(readValue)

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value
      setStoredValue(valueToStore)
      window.localStorage.setItem(key, JSON.stringify(valueToStore))
    } catch (error) {
      console.warn('[WAVETEK] storage write failed <ENCRYPTED>')
    }
  }

  useEffect(() => {
    const handleStorageChange = () => {
      setStoredValue(readValue())
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return [storedValue, setValue] as const
}
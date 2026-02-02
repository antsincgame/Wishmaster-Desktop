import { describe, it, expect } from 'vitest'
import { formatTime, formatDate, formatSize, truncate } from './utils'

describe('formatTime', () => {
  it('should format timestamp to HH:MM format', () => {
    // Arrange
    const timestamp = new Date('2024-01-15T14:30:00').getTime()
    
    // Act
    const result = formatTime(timestamp)
    
    // Assert
    expect(result).toMatch(/^\d{2}:\d{2}$/)
  })
  
  it('should handle midnight correctly', () => {
    // Arrange
    const midnight = new Date('2024-01-15T00:00:00').getTime()
    
    // Act
    const result = formatTime(midnight)
    
    // Assert
    expect(result).toBe('00:00')
  })
  
  it('should handle noon correctly', () => {
    // Arrange
    const noon = new Date('2024-01-15T12:00:00').getTime()
    
    // Act
    const result = formatTime(noon)
    
    // Assert
    expect(result).toBe('12:00')
  })
})

describe('formatDate', () => {
  it('should format timestamp to date string', () => {
    // Arrange
    const timestamp = new Date('2024-01-15').getTime()
    
    // Act
    const result = formatDate(timestamp)
    
    // Assert
    expect(result).toContain('15')
    expect(result).toContain('01') // month
    expect(result).toContain('2024')
  })
})

describe('formatSize', () => {
  it('should format bytes correctly', () => {
    // Arrange & Act & Assert
    expect(formatSize(500)).toBe('500 B')
    expect(formatSize(1023)).toBe('1023 B')
  })
  
  it('should format kilobytes correctly', () => {
    // Arrange & Act & Assert
    expect(formatSize(1024)).toBe('1 KB')
    expect(formatSize(1536)).toBe('2 KB') // rounds to nearest
    expect(formatSize(10240)).toBe('10 KB')
  })
  
  it('should format megabytes correctly', () => {
    // Arrange & Act & Assert
    expect(formatSize(1024 * 1024)).toBe('1 MB')
    expect(formatSize(5 * 1024 * 1024)).toBe('5 MB')
    expect(formatSize(512 * 1024 * 1024)).toBe('512 MB')
  })
  
  it('should format gigabytes correctly', () => {
    // Arrange & Act & Assert
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.0 GB')
    expect(formatSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB')
    expect(formatSize(7 * 1024 * 1024 * 1024)).toBe('7.0 GB')
  })
  
  // Edge cases
  it('should handle zero bytes', () => {
    expect(formatSize(0)).toBe('0 B')
  })
  
  it('should handle very large files', () => {
    const terabyte = 1024 * 1024 * 1024 * 1024
    expect(formatSize(terabyte)).toBe('1024.0 GB')
  })
})

describe('truncate', () => {
  it('should not truncate string shorter than maxLength', () => {
    // Arrange
    const str = 'Hello'
    
    // Act
    const result = truncate(str, 10)
    
    // Assert
    expect(result).toBe('Hello')
  })
  
  it('should not truncate string equal to maxLength', () => {
    // Arrange
    const str = 'Hello'
    
    // Act
    const result = truncate(str, 5)
    
    // Assert
    expect(result).toBe('Hello')
  })
  
  it('should truncate string longer than maxLength with ellipsis', () => {
    // Arrange
    const str = 'Hello World'
    
    // Act
    const result = truncate(str, 8)
    
    // Assert
    expect(result).toBe('Hello...')
    expect(result.length).toBe(8)
  })
  
  it('should handle very long strings', () => {
    // Arrange
    const str = 'This is a very long string that needs to be truncated'
    
    // Act
    const result = truncate(str, 20)
    
    // Assert
    expect(result).toBe('This is a very lo...')
    expect(result.length).toBe(20)
  })
  
  // Edge cases
  it('should handle empty string', () => {
    expect(truncate('', 10)).toBe('')
  })
  
  it('should handle maxLength of 3 (minimum for ellipsis)', () => {
    expect(truncate('Hello', 3)).toBe('...')
  })
  
  it('should handle Unicode characters', () => {
    const str = 'Привет мир'
    const result = truncate(str, 8)
    expect(result).toBe('Приве...')
  })
})

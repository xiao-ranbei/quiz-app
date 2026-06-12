# =============================================================
#  刷题平台 - 一键部署脚本
#  功能：构建前端 + 推送 SQL 迁移 + 部署 Edge Functions + Git 推送
#  使用：在 PowerShell 中运行  .\deploy-all.ps1
# =============================================================

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  刷题平台 一键部署" -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "项目目录: $ProjectRoot"
Write-Host ""

# --- 1. 检查依赖 ---
Write-Host "[1/5] 检查依赖..." -ForegroundColor Yellow

# 检查 Node.js
try {
    $nodeVer = node --version 2>$null
    if ($nodeVer) { Write-Host "  ✓ Node.js $nodeVer" -ForegroundColor Green }
    else { Write-Host "  ✗ Node.js 未安装" -ForegroundColor Red; exit 1 }
} catch { Write-Host "  ✗ Node.js 未安装" -ForegroundColor Red; exit 1 }

# 检查 Supabase CLI
try {
    $sbVer = & supabase --version 2>$null
    if ($sbVer) { Write-Host "  ✓ Supabase CLI $sbVer" -ForegroundColor Green }
    else { Write-Host "  ✗ Supabase CLI 未安装" -ForegroundColor Red; exit 1 }
} catch { Write-Host "  ✗ Supabase CLI 未安装" -ForegroundColor Red; exit 1 }

# 检查 Git
try {
    $gitVer = git --version 2>$null
    if ($gitVer) { Write-Host "  ✓ Git" -ForegroundColor Green }
    else { Write-Host "  ! Git 未安装（将跳过 GitHub 推送）" -ForegroundColor Yellow }
} catch { Write-Host "  ! Git 未安装（将跳过 GitHub 推送）" -ForegroundColor Yellow }

Write-Host ""

# --- 2. 构建前端 ---
Write-Host "[2/5] 构建前端应用..." -ForegroundColor Yellow
try {
    npm run build 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "npm run build 失败" }
    Write-Host "  ✓ 构建成功" -ForegroundColor Green
} catch {
    Write-Host "  ✗ 构建失败: $_" -ForegroundColor Red
    exit 1
}
Write-Host ""

# --- 3. 推送 SQL 迁移 ---
Write-Host "[3/5] 推送 SQL 迁移到 Supabase..." -ForegroundColor Yellow
try {
    $migrateOut = & supabase db push 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ! 迁移警告: $migrateOut" -ForegroundColor Yellow
    } else {
        Write-Host "  ✓ 迁移已同步" -ForegroundColor Green
    }
} catch {
    Write-Host "  ! 迁移警告: $_" -ForegroundColor Yellow
}
Write-Host ""

# --- 4. 部署 Edge Functions ---
Write-Host "[4/5] 部署 Edge Functions..." -ForegroundColor Yellow
try {
    $funcOut = & supabase functions deploy 2>&1
    if ($LASTEXITCODE -ne 0) { throw $funcOut }
    Write-Host "  ✓ Edge Functions 已部署" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Edge Functions 部署失败: $_" -ForegroundColor Red
}
Write-Host ""

# --- 5. 推送 GitHub（带重试）---
Write-Host "[5/5] 推送代码到 GitHub..." -ForegroundColor Yellow
$gitAvailable = $false
try {
    $null = git --version 2>$null
    $gitAvailable = ($LASTEXITCODE -eq 0)
} catch { }

if ($gitAvailable) {
    $pushed = $false
    for ($i = 1; $i -le 5; $i++) {
        try {
            git add -A 2>&1 | Out-Null
            git commit -m "chore: auto deploy" 2>&1 | Out-Null
            $pushResult = git push origin main 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host "  ✓ 已推送到 GitHub" -ForegroundColor Green
                $pushed = $true
                break
            }
            Write-Host "  第 $i 次重试 GitHub 推送..." -ForegroundColor Gray
            Start-Sleep -Seconds 2
        } catch {
            Write-Host "  第 $i 次重试 GitHub 推送..." -ForegroundColor Gray
            Start-Sleep -Seconds 2
        }
    }
    if (-not $pushed) {
        Write-Host "  ⚠  GitHub 推送失败（可能是网络问题）" -ForegroundColor Yellow
        Write-Host "     请在本机运行: git push origin main" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ! 跳过 GitHub 推送（Git 不可用）" -ForegroundColor Yellow
}
Write-Host ""

# --- 完成 ---
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  部署完成！" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "前端访问: https://xiao-ranbei.github.io/quiz-app/"
Write-Host "管理后台: https://supabase.com/dashboard/project/soiswftjljwcnuzkmpoj"
Write-Host ""
Write-Host "如前端页面未更新，请稍等 1-2 分钟让 GitHub Pages 构建完成。"
Write-Host ""
